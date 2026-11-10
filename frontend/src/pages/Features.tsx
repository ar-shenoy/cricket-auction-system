import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const LABELS: Record<string, { title: string; desc: string; group?: string }> = {
  players: { title: 'Players', desc: 'Player import, approval and roster management', group: 'Modules' },
  teams: { title: 'Teams', desc: 'Team creation, purse and manager accounts', group: 'Modules' },
  auction: { title: 'Auction', desc: 'Live auction room and bidding', group: 'Modules' },
  scoring: { title: 'Scoring', desc: 'Match scoring panel and scoreboard feeds', group: 'Modules' },
  reports: { title: 'Reports (admin)', desc: 'Admin squad reports and exports', group: 'Modules' },
  billing: { title: 'Billing', desc: 'Plan and payment screens', group: 'Modules' },
  liveTeams: { title: 'Live · show teams', desc: 'Show team purse list on the public /live page', group: 'Public live' },
  points: { title: 'Points table', desc: 'Tournament points / NRR page', group: 'Modules' },
  scoreboard: { title: 'Scoreboard', desc: 'Projector / live scoreboard', group: 'Modules' },
  auctionTimer: { title: 'Auction · bid timer', desc: 'Countdown timer and auto-unsold on expiry', group: 'Auction detail' },
  auctionKeyboard: { title: 'Auction · keyboard shortcuts', desc: 'S/U/R/Z and 1–9 team bid keys', group: 'Auction detail' },
  auctionExport: { title: 'Auction · CSV export', desc: 'Export sold squads from auction page', group: 'Auction detail' },
  auctionBudgetHints: { title: 'Auction · budget hints', desc: 'Show ~N more @ min under team tiles', group: 'Auction detail' },
  auctionRecallUnsold: { title: 'Auction · recall unsold', desc: 'Second-pass random from unsold pool', group: 'Auction detail' },
  matchDls: { title: 'Match · D/L reduce overs', desc: 'Allow revised overs / target on scoring', group: 'Match detail' },
  matchSuperOver: { title: 'Match · Super Over', desc: 'Super Over control on scoring panel', group: 'Match detail' },
  matchRainDelay: { title: 'Match · rain delay', desc: 'Rain delay / resume controls', group: 'Match detail' }
};

export default function Features() {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/orgs/features')
      .then(r => setFeatures(r.data.features || {}))
      .catch(() => setMsg('Failed to load features'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.put('/orgs/features', { features });
      setFeatures(r.data.features || features);
      setMsg('Saved. Refresh other tabs to apply.');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const isDev = user?.role === 'developer' || user?.email === 'developer@auction.com';
  if (!isDev) {
    return (
      <AppShell title="Features">
        <div className="glass p-8 text-center space-y-2" style={{ color: 'var(--text-2)' }}>
          <div className="font-medium" style={{ color: 'var(--text)' }}>Developer login required</div>
          <p className="text-[13px]">Sign in with the platform developer account to manage feature toggles.</p>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return <AppShell title="Features"><div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;
  }

  const groups = Array.from(new Set(Object.keys(LABELS).map(k => LABELS[k].group || 'Other')));

  return (
    <AppShell title="Features" subtitle="Per-org toggles (developer)">
      <div className="space-y-4 max-w-2xl">
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Turn modules and granular controls on/off for this organisation. Admins only see enabled nav items; auction/scoring UI respects these flags.
        </p>
        {msg && <div className="glass p-3 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}
        {groups.map(g => (
          <div key={g} className="glass p-4 space-y-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{g}</div>
            {Object.keys(LABELS).filter(k => (LABELS[k].group || 'Other') === g).map(key => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={!!features[key]} onChange={() => toggle(key)} />
                <span>
                  <span className="font-medium text-[14px]" style={{ color: 'var(--text)' }}>{LABELS[key].title}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text-2)' }}>{LABELS[key].desc}</span>
                </span>
              </label>
            ))}
          </div>
        ))}
        <button type="button" className="as-btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save features'}
        </button>
      </div>
    </AppShell>
  );
}
