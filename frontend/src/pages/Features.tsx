import React, { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const LABELS: Record<string, { title: string; desc: string }> = {
  players: { title: 'Players', desc: 'Player import, approval and roster management' },
  teams: { title: 'Teams', desc: 'Team creation, purse and manager accounts' },
  auction: { title: 'Auction', desc: 'Live auction room and bidding' },
  scoring: { title: 'Scoring', desc: 'Match scoring panel and scoreboard feeds' },
  reports: { title: 'Reports', desc: 'Squad reports and export tools' },
  billing: { title: 'Billing', desc: 'Plan and payment screens' },
  liveTeams: { title: 'Live · show teams', desc: 'Show team purse list on the public /live page' },
  points: { title: 'Points table', desc: 'Tournament points / NRR page' },
  scoreboard: { title: 'Scoreboard', desc: 'Projector scoreboard link' }
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
      setMsg('Saved. Refresh other tabs to apply nav changes.');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'developer') {
    return (
      <AppShell title="Features">
        <div className="glass p-8 text-center space-y-2" style={{ color: 'var(--text-2)' }}>
          <div className="font-medium" style={{ color: 'var(--text)' }}>Developer login required</div>
          <p className="text-[13px]">Feature toggles are only available to the platform developer account — not league admins.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Feature toggles" subtitle="Platform developer — control modules for this organisation">
      {loading ? (
        <div className="glass p-8 text-center" style={{ color: 'var(--text-2)' }}>Loading…</div>
      ) : (
        <div className="space-y-3.5 max-w-xl">
          {msg && (
            <div className="glass p-3 text-[14px]" style={{ color: 'var(--accent)' }}>{msg}</div>
          )}
          <div className="glass overflow-hidden">
            {Object.keys(LABELS).map(key => (
              <div key={key} className="glass-row items-center">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px]">{LABELS[key].title}</div>
                  <div className="text-[12px]" style={{ color: 'var(--text-2)' }}>{LABELS[key].desc}</div>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="relative w-12 h-7 rounded-full transition shrink-0"
                  style={{ background: features[key] ? 'var(--accent)' : 'var(--fill)' }}
                  aria-pressed={!!features[key]}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition"
                    style={{ transform: features[key] ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={save} disabled={saving} className="as-btn-primary">
            {saving ? 'Saving…' : 'Save features'}
          </button>
        </div>
      )}
    </AppShell>
  );
}
