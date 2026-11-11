import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const LABELS: Record<string, { title: string; desc: string; group: string }> = {
  players: { title: 'Players module', desc: 'Player import, approval, roster', group: 'Modules' },
  teams: { title: 'Teams module', desc: 'Franchises, purses, logos', group: 'Modules' },
  auction: { title: 'Auction module', desc: 'Live auction room', group: 'Modules' },
  scoring: { title: 'Scoring module', desc: 'Ball-by-ball match scoring', group: 'Modules' },
  reports: { title: 'Reports (admin)', desc: 'Admin squad reports & exports', group: 'Modules' },
  billing: { title: 'Billing', desc: 'Plan & payment screens', group: 'Modules' },
  points: { title: 'Points table', desc: 'Standings / NRR page', group: 'Modules' },
  scoreboard: { title: 'Projector scoreboard', desc: 'Fullscreen board link', group: 'Modules' },
  tournamentHub: { title: 'Tournament Hub', desc: 'Seasons, fixtures, venues, standings admin', group: 'Modules' },
  franchisePortal: { title: 'Franchise Portal', desc: 'Team manager purse, squad, match sheet', group: 'Modules' },
  broadcastPack: { title: 'Broadcast Pack', desc: 'Brand kit, sponsors, OBS lower-thirds', group: 'Modules' },
  intelligence: { title: 'Intelligence 2.0', desc: 'Market values, role inflation, impact', group: 'Modules' },
  publicLive: { title: 'Public · Auction live', desc: '/live for audience', group: 'Public feeds' },
  publicResults: { title: 'Public · Squads & results', desc: '/results for audience', group: 'Public feeds' },
  publicMatchCentre: { title: 'Public · Match centre', desc: '/match-live ICC-style centre', group: 'Public feeds' },
  publicTournament: { title: 'Public · Tournament page', desc: '/tournament hub for fans', group: 'Public feeds' },
  publicPoints: { title: 'Public · Points', desc: '/points table', group: 'Public feeds' },
  liveTeams: { title: 'Live · show team purses', desc: 'Team purse list on /live', group: 'Public feeds' },
  auctionTimer: { title: 'Auction · bid timer', desc: 'Countdown & auto-unsold', group: 'Auction detail' },
  auctionKeyboard: { title: 'Auction · keyboard shortcuts', desc: 'S/U/R/Z and 1–9 team keys', group: 'Auction detail' },
  auctionExport: { title: 'Auction · CSV export', desc: 'Export sold squads', group: 'Auction detail' },
  auctionBudgetHints: { title: 'Auction · budget hints', desc: '~N more @ min under teams', group: 'Auction detail' },
  auctionRecallUnsold: { title: 'Auction · recall unsold', desc: 'Second-pass from unsold pool', group: 'Auction detail' },
  auctionShareLive: { title: 'Auction · share live button', desc: 'Share /live from auction room', group: 'Auction detail' },
  matchDls: { title: 'Match · D/L reduce overs', desc: 'Revised overs / target', group: 'Match detail' },
  matchSuperOver: { title: 'Match · Super Over', desc: 'Super Over control', group: 'Match detail' },
  matchRainDelay: { title: 'Match · rain delay', desc: 'Rain delay / resume', group: 'Match detail' },
  matchCsvImport: { title: 'Match · squad CSV import', desc: 'Import players from CSV on scoring', group: 'Match detail' },
  dashboardAnalytics: { title: 'Home · analytics KPIs', desc: 'Spend bars, top buys on Command Centre', group: 'Command centre' },
  dashboardPublicFeeds: { title: 'Home · public feed links', desc: 'Share links strip on Command Centre', group: 'Command centre' }
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

  const setAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    Object.keys(LABELS).forEach(k => { next[k] = val; });
    setFeatures(next);
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const r = await api.put('/orgs/features', { features });
      setFeatures(r.data.features || features);
      setMsg('Saved. Refresh other tabs to apply nav and UI flags.');
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
          <p className="text-[13px]">Only the platform developer account can change feature toggles for this org.</p>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return <AppShell title="Features"><div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div></AppShell>;
  }

  const groups = Array.from(new Set(Object.values(LABELS).map(l => l.group)));

  return (
    <AppShell title="Features" subtitle="Per-org toggles — every product surface">
      <div className="space-y-4 max-w-2xl">
        <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
          Turn any module or control on/off for this organisation. Nav, public links, and in-page controls respect these flags after save + refresh.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="as-btn-ghost text-sm" onClick={() => setAll(true)}>Enable all</button>
          <button type="button" className="as-btn-ghost text-sm" onClick={() => setAll(false)}>Disable all</button>
          <button type="button" className="as-btn-primary text-sm" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save features'}
          </button>
        </div>
        {msg && <div className="glass p-3 text-[13px]" style={{ color: 'var(--accent)' }}>{msg}</div>}
        {groups.map(g => (
          <div key={g} className="glass p-4 space-y-3">
            <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{g}</div>
            {Object.keys(LABELS).filter(k => LABELS[k].group === g).map(key => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={features[key] !== false} onChange={() => toggle(key)} />
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
